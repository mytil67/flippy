import { Component } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './style.css';
// Load both scoped stylesheets before choosing the page module.
import './collectionFleet.css';
import './radarStation.css';
import './collectionPage.css';

const collection = /^\/collection\/?$/.test(window.location.pathname);
const root = createRoot(document.getElementById('root'));

function StartupError() {
  return <main className="startup-status" role="alert">
    <h1>FLIPPY n’a pas pu charger cette page.</h1>
    <a href={window.location.pathname}>Réessayer</a>
    <a href={collection ? '/' : '/collection'}>{collection ? 'Retour au radar' : 'Ouvrir ma collection'}</a>
  </main>;
}

class PageBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <StartupError /> : this.props.children; }
}

const page = collection ? import('./Collection.jsx') : import('./App.jsx');
page.then(({ default: Page }) => {
  root.render(<PageBoundary><Page /></PageBoundary>);
}).catch(error => {
  console.error('Chargement de FLIPPY', error);
  root.render(<StartupError />);
});
