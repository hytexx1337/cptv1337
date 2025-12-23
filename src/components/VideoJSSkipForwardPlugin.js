import videojs from 'video.js';

// Plugin para agregar botón de avanzar 10 segundos
const SkipForwardPlugin = function(options = {}) {
  const player = this;
  
  // Crear el botón personalizado
  class SkipForwardButton extends videojs.getComponent('Button') {
    constructor(player, options) {
      super(player, options);
      this.addClass('vjs-skip-forward-button');
      this.controlText('Avanzar 10 segundos');
    }

    createEl() {
      const button = super.createEl('button', {
        className: 'vjs-skip-forward-button vjs-control vjs-button',
        innerHTML: `
          <span class="vjs-icon-placeholder" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M6.444 3.685A10 10 0 0 1 18 4h-2v2h4a1 1 0 0 0 1-1V1h-2v1.253A12 12 0 1 0 24 12h-2A10 10 0 1 1 6.444 3.685ZM22 4v3h-3v2h4a1 1 0 0 0 1-1V4h-2Zm-9.398 11.576c.437.283.945.424 1.523.424s1.083-.141 1.513-.424c.437-.29.774-.694 1.009-1.215.235-.527.353-1.148.353-1.861 0-.707-.118-1.324-.353-1.851-.235-.527-.572-.932-1.009-1.215-.43-.29-.935-.434-1.513-.434-.578 0-1.086.145-1.523.434-.43.283-.764.688-.999 1.215-.235.527-.353 1.144-.353 1.851 0 .713.118 1.334.353 1.86.236.522.568.927.999 1.216Zm2.441-1.485c-.222.373-.528.56-.918.56s-.696-.187-.918-.56c-.222-.38-.333-.91-.333-1.591 0-.681.111-1.208.333-1.581.222-.38.528-.57.918-.57s.696.19.918.57c.222.373.333.9.333 1.581 0 .681-.111 1.212-.333 1.59Zm-6.439-3.375v5.14h1.594V9.018L7 9.82v1.321l1.604-.424Z" fill="currentColor"></path>
            </svg>
          </span>
          <span class="vjs-control-text">Avanzar 10 segundos</span>
        `
      });
      
      return button;
    }

    handleClick() {
      const currentTime = this.player_.currentTime();
      const duration = this.player_.duration();
      this.player_.currentTime(Math.min(duration, currentTime + 10));
    }
  }

  // Registrar el componente
  videojs.registerComponent('SkipForwardButton', SkipForwardButton);

  // Agregar el botón a la barra de control
  player.ready(() => {
    const skipForwardButton = new SkipForwardButton(player, options);
    
    // Insertar el botón antes del volume panel
    const controlBar = player.controlBar;
    const volumePanel = controlBar.volumePanel;
    
    if (volumePanel) {
      controlBar.el().insertBefore(
        skipForwardButton.el(), 
        volumePanel.el()
      );
    } else {
      controlBar.el().appendChild(skipForwardButton.el());
    }
  });
};

// Registrar el plugin
videojs.registerPlugin('skipForward', SkipForwardPlugin);

export default SkipForwardPlugin;

