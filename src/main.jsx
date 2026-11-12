import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Collection from './Collection.jsx';
import 'leaflet/dist/leaflet.css';
import './style.css';

const collection = /^\/collection\/?$/.test(window.location.pathname);
createRoot(document.getElementById('root')).render(collection ? <Collection /> : <App />);
