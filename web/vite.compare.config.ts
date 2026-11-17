import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{host:'localhost',port:5174,strictPort:true,proxy:{'/comparison-api':{target:'http://127.0.0.1:8786',changeOrigin:true,rewrite:p=>p.replace(/^\/comparison-api/,'')}}},build:{outDir:'../.stresslog-local/comparison-build',emptyOutDir:true,rolldownOptions:{input:'compare.html'}}});
