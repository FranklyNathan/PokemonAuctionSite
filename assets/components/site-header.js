class SiteHeader extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    this.innerHTML = `
      <style>
        site-header {
          display: block;
          position: sticky;
          top: 0;
          z-index: 1000;
          width: 100%;
        }
        .site-header {
          width: 100%;
          display: flex;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.5rem;
          background-color: #222;
          border-bottom: 1px solid var(--sl-color-primary-500);
          flex-wrap: wrap;
          box-sizing: border-box;
          align-items: center;
        }
        .sl-theme-dark .site-header {
          border-bottom-color: var(--sl-color-primary-500);
        }
        .site-header sl-button {
          margin: 0.2rem;
          width: 120px;
        }
        .site-header sl-button::part(base) {
          transition: filter 0.2s ease-in-out;
        }
        .site-header sl-button:hover::part(base) {
          filter: brightness(1.2);
        }
        .home-logo {
          display: flex;
          transition: filter 0.2s ease-in-out;
        }
        .home-logo:hover {
          filter: brightness(1.2);
        }
        .home-logo img {
          height: 2.5rem;
          width: auto;
        }
      </style>
      <div class="site-header">
        <a href="/" class="home-logo"><img src="/BlitzLogoBlue.png" alt="Home" /></a>
        <sl-button variant="primary" size="small" href="/setup">Auction Setup</sl-button>
        <sl-button variant="primary" size="small" href="/teamplanner">Team Planner</sl-button>
        <sl-button variant="primary" size="small" href="/faq">FAQ</sl-button>
        <sl-button variant="primary" size="small" href="/resource-dex">Pokédex</sl-button>
        <sl-button variant="primary" size="small" href="/index">Blitz Info</sl-button>
        <sl-button variant="primary" size="small" href="/assets/boss-battles.html" target="_blank">Boss Battles</sl-button>
        <sl-button variant="primary" size="small" href="/patchnotes">Patch Notes</sl-button>
      </div>
    `;
  }
}

customElements.define('site-header', SiteHeader);
