import {createApp} from 'vue'
import App from './App.vue'
import { registerBundledFontFaces } from './fontFaces'
import './style.css';

registerBundledFontFaces();
createApp(App).mount('#app')
