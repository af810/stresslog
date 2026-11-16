package com.nishi.stresslog.watchprobe
import org.junit.Assert.*
import org.junit.Test
class LongRunPolicyTest {
    @Test fun batteryBoundaryAndInvalidReadings() {
        assertTrue(LongRunPolicy.lowBattery(20, 20)); assertTrue(LongRunPolicy.lowBattery(0, 20))
        assertFalse(LongRunPolicy.lowBattery(21, 20)); assertFalse(LongRunPolicy.lowBattery(-1, 20))
        assertEquals(20, LongRunPolicy.threshold(0)); assertEquals(30, LongRunPolicy.threshold(30))
    }
    @Test fun reconnectBackoffIsBounded() {
        assertEquals(12000L, LongRunPolicy.retryDelay(6000)); assertEquals(60000L, LongRunPolicy.retryDelay(48000)); assertEquals(60000L, LongRunPolicy.retryDelay(60000))
    }
}
