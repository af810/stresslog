$ErrorActionPreference = "Stop"
$rand = New-Object System.Random(42)

function Epoch([datetime]$dt) {
    $utc = $dt.ToUniversalTime()
    $epoch = [datetime]::new(1970,1,1,0,0,0,[DateTimeKind]::Utc)
    return [long](($utc - $epoch).TotalMilliseconds)
}

function ClampD([double]$v, [double]$lo, [double]$hi) {
    return [Math]::Max($lo, [Math]::Min($hi, $v))
}

function DailyRhythm([double]$hour, [bool]$badDay) {
    $peakShift = $hour - 15.0
    $gauss = [math]::Exp(-($peakShift*$peakShift)/(2*6.0*6.0))
    $nightDamp = 1.0
    if ($hour -lt 5 -or $hour -gt 23) { $nightDamp = 0.05 }
    $base = 0.15 + 0.35 * $gauss
    $badBonus = 0.0
    if ($badDay) { $badBonus = 0.20 }
    $v = ($base + $badBonus) * $nightDamp
    if ($v -lt 0.0) { $v = 0.0 }
    return $v
}

function NextInRange([double]$lo, [double]$hi) {
    $span = $hi - $lo
    return $lo + ($rand.NextDouble() * $span)
}

$now = Get-Date
$startDay = $now.Date.AddDays(-60)

$readingRows = New-Object System.Collections.Generic.List[string]
$momentRows = New-Object System.Collections.Generic.List[string]

$lastAutoMomentEpoch = [long]0
$autoCooldownMs = 2 * 60 * 60 * 1000

$baselineMeanHrv = 45.0
$baselineStdHrv = 10.0
$baselineMeanHr = 65.0

$suggestDay = "1分だけ席を立って歩いてみましょう。軽い運動が交感神経の高ぶりを鎮めます。"
$suggestNight = "画面から少し離れて深呼吸を。夜のブルーライトは交感神経をさらに刺激することがあります。"
$suggestSevere = "かなり高いストレス反応が出ています。4-7-8呼吸法（4秒吸う→7秒止める→8秒吐くを3セット）を試してみましょう。"

for ($d = 0; $d -lt 60; $d++) {
    $day = $startDay.AddDays($d)
    $dow = [int]$day.DayOfWeek
    $badDayRoll = $rand.NextDouble()
    $badDay = $false
    if ($badDayRoll -lt 0.15) { $badDay = $true }
    $isTueWed = $false
    if ($dow -eq 2 -or $dow -eq 3) { $isTueWed = $true }

    $isRecent = $d -ge 58
    $hours = @()
    if ($isRecent) {
        for ($k = 0; $k -lt 48; $k++) { $hours += ($k * 0.5) }
    } else {
        $hours = @(7.0, 10.0, 13.0, 15.5, 18.0, 21.0)
    }

    foreach ($h in $hours) {
        $sampleTime = $day.AddHours($h)
        if ($sampleTime -gt $now) { continue }

        $load = DailyRhythm -hour $h -badDay $badDay

        if ($isTueWed -and $h -ge 13.0 -and $h -le 17.0) {
            $bonus = NextInRange 0.10 0.25
            $load = [Math]::Min(1.0, $load + $bonus)
        }

        $spikeRoll = $rand.NextDouble()
        if ($spikeRoll -lt 0.04) {
            $spikeAmt = NextInRange 0.25 0.55
            $load = [Math]::Min(1.0, $load + $spikeAmt)
        }

        $hrvNoise = NextInRange -4.0 4.0
        $hrRaw = NextInRange -5.0 5.0

        $hrvVal = ClampD (55.0 - $load*30.0 + $hrvNoise) 10.0 80.0
        $hrVal = [int](ClampD (62 + $load*35 + $hrRaw) 45 150)

        $zHrv = ($baselineMeanHrv - $hrvVal) / $baselineStdHrv
        $zHr = ($hrVal - $baselineMeanHr) / 15.0
        $rawScore = 50.0 + (0.7*$zHrv + 0.3*$zHr) * 20.0
        $score = [int](ClampD ([math]::Round($rawScore)) 0 100)

        $ts = Epoch $sampleTime
        $hrvRounded = [Math]::Round($hrvVal, 1)
        $readingRows.Add("($ts,$score,$hrvRounded,$hrVal,$baselineMeanHrv,'mock')")

        if ($score -ge 70 -and ($ts - $lastAutoMomentEpoch) -ge $autoCooldownMs) {
            $lastAutoMomentEpoch = $ts
            $suggestion = $suggestDay
            if ($score -ge 85) {
                $suggestion = $suggestSevere
            } elseif ($h -lt 6 -or $h -gt 17) {
                $suggestion = $suggestNight
            }
            $momentRows.Add("($ts,$score,'AUTO',NULL,'',$hrVal,NULL,'$suggestion')")
        }
    }
}

$manualSpecs = @(
    @{ dowSet = @(2,3); hourLo = 13; hourHi = 17; tags = "仕事,会議"; scoreLo = 72; scoreHi = 90; notes = @("会議で急な指摘があった","締め切り前でバタバタしていた") },
    @{ dowSet = @(0,1,2,3,4,5,6); hourLo = 6; hourHi = 8; tags = "睡眠不足"; scoreLo = 65; scoreHi = 85; notes = @("寝不足で朝から重い","夜更かしした翌朝") },
    @{ dowSet = @(0,1,2,3,4,5,6); hourLo = 8; hourHi = 9; tags = "移動"; scoreLo = 55; scoreHi = 75; notes = @("満員電車がきつかった","電車の遅延で焦った") },
    @{ dowSet = @(5,6); hourLo = 11; hourHi = 20; tags = "家庭"; scoreLo = 50; scoreHi = 70; notes = @("家のことでバタバタした") },
    @{ dowSet = @(0,1,2,3,4,5,6); hourLo = 19; hourHi = 22; tags = "人間関係"; scoreLo = 60; scoreHi = 80; notes = @("友人とのやり取りで気を遣った") }
)

foreach ($spec in $manualSpecs) {
    $count = Get-Random -Minimum 3 -Maximum 6
    for ($i = 0; $i -lt $count; $i++) {
        $attempts = 0
        $day = $null
        while ($attempts -lt 50) {
            $daysAgo = Get-Random -Minimum 1 -Maximum 59
            $candidate = $now.Date.AddDays(0 - $daysAgo)
            $cdow = [int]$candidate.DayOfWeek
            if ($spec.dowSet -contains $cdow) { $day = $candidate; break }
            $attempts++
        }
        if ($null -eq $day) { continue }

        $hour = Get-Random -Minimum $spec.hourLo -Maximum $spec.hourHi
        $minute = Get-Random -Minimum 0 -Maximum 59
        $sampleTime = $day.AddHours($hour).AddMinutes($minute)
        if ($sampleTime -gt $now) { continue }

        $ts = Epoch $sampleTime
        $score = Get-Random -Minimum $spec.scoreLo -Maximum $spec.scoreHi
        $tagsStr = $spec.tags
        $noteIdx = Get-Random -Minimum 0 -Maximum $spec.notes.Count
        $note = $spec.notes[$noteIdx]
        $hrApprox = [int](62 + ($score - 50) * 0.7)
        $momentRows.Add("($ts,$score,'MANUAL','$note','$tagsStr',$hrApprox,NULL,NULL)")
    }
}

$sql = New-Object System.Text.StringBuilder
[void]$sql.AppendLine("BEGIN TRANSACTION;")
foreach ($row in $readingRows) {
    [void]$sql.AppendLine("INSERT INTO stress_readings (timestamp,stressScore,hrvRmssd,heartRate,baselineHrv,source) VALUES $row;")
}
foreach ($row in $momentRows) {
    [void]$sql.AppendLine("INSERT INTO stress_moments (timestamp,stressScore,trigger,note,tags,hrBefore,hrAfter,appliedSuggestion) VALUES $row;")
}
$nowEpoch = Epoch $now
$totalCount = $readingRows.Count
[void]$sql.AppendLine("INSERT OR REPLACE INTO baselines (id,meanHrv,stdHrv,meanRestingHr,sampleCount,updatedAt) VALUES (0,$baselineMeanHrv,$baselineStdHrv,$baselineMeanHr,$totalCount,$nowEpoch);")
[void]$sql.AppendLine("COMMIT;")

$outPath = "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build\seed.sql"
[System.IO.File]::WriteAllText($outPath, $sql.ToString(), (New-Object System.Text.UTF8Encoding($false)))

Write-Output "Generated $($readingRows.Count) readings and $($momentRows.Count) moments"
Write-Output "SQL file: $outPath"
