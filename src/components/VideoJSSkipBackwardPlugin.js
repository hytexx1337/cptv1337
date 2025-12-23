import videojs from 'video.js';

// Plugin para agregar botón de retroceder 10 segundos
const SkipBackwardPlugin = function(options = {}) {
  const player = this;
  
  // Crear el botón personalizado
  class SkipBackwardButton extends videojs.getComponent('Button') {
    constructor(player, options) {
      super(player, options);
      this.addClass('vjs-skip-backward-button');
      this.controlText('Retroceder 10 segundos');
    }

    createEl() {
      const button = super.createEl('button', {
        className: 'vjs-skip-backward-button vjs-control vjs-button',
        innerHTML: `
          <span class="vjs-icon-placeholder" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M11.02 2.048A10 10 0 1 1 2 12H0a12 12 0 1 0 5-9.747V1H3v4a1 1 0 0 0 1 1h4V4H6a10 10 0 0 1 5.02-1.952ZM2 4v3h3v2H1a1 1 0 0 1-1-1V4h2Zm12.125 12c-.578 0-1.086-.141-1.523-.424-.43-.29-.764-.694-.999-1.215-.235-.527-.353-1.148-.353-1.861 0-.707.118-1.324.353-1.851.236-.527.568-.932.999-1.215.437-.29.945-.434 1.523-.434s1.083.145 1.513.434c.437.283.774.688 1.009 1.215.235.527.353 1.144.353 1.851 0 .713-.118 1.334-.353 1.86-.235.522-.572.927-1.009 1.216-.43.283-.935.424-1.513.424Zm0-1.35c.39 0 .696-.186.918-.56.222-.378.333-.909.333-1.59s-.111-1.208-.333-1.581c-.222-.38-.528-.57-.918-.57s-.696.19-.918.57c-.222.373-.333.9-.333 1.581 0 .681.111 1.212.333 1.59.222.374.528.56.918.56Zm-5.521 1.205v-5.139L7 11.141V9.82l3.198-.8v6.835H8.604Z" fill="currentColor"></path>
            </svg>
          </span>
          <span class="vjs-control-text">Retroceder 10 segundos</span>
        `
      });
      
      return button;
    }

    handleClick() {
      const currentTime = this.player_.currentTime();
      this.player_.currentTime(Math.max(0, currentTime - 10));
    }
  }

  // Registrar el componente
  videojs.registerComponent('SkipBackwardButton', SkipBackwardButton);

  // Agregar el botón a la barra de control
  player.ready(() => {
    const skipBackwardButton = new SkipBackwardButton(player, options);
    
    // Insertar el botón después del play button
    const controlBar = player.controlBar;
    const playToggle = controlBar.playToggle;
    
    if (playToggle && playToggle.el().nextSibling) {
      controlBar.el().insertBefore(
        skipBackwardButton.el(), 
        playToggle.el().nextSibling
      );
    } else if (playToggle) {
      controlBar.el().insertBefore(
        skipBackwardButton.el(), 
        playToggle.el().nextSibling
      );
    } else {
      controlBar.el().appendChild(skipBackwardButton.el());
    }
  });
};

// Registrar el plugin
videojs.registerPlugin('skipBackward', SkipBackwardPlugin);

export default SkipBackwardPlugin;

