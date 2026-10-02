import './style.css';
import { startApp } from './app.js';
import { toast } from './ui/dom.js';
startApp().catch((error) => toast(error.message));
