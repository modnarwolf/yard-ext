import './style.css';
import './desktop.css';
import './appearance.css';
import './desktop-adapter.css';
import { startApp } from './app.js';
import { toast } from './ui/dom.js';
startApp().catch((error) => toast(error.message));
