import videojs from 'video.js';

// Logger simple para JS (compatible con el sistema de logging)
const IS_DEBUG = typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_DEBUG !== undefined
  ? process.env.NEXT_PUBLIC_DEBUG === 'true'
  : typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';

const log = (...args) => IS_DEBUG && log(...args);

// Plugin para agregar botón de carga de subtítulos al reproductor
const SubtitleUploadPlugin = function(options = {}) {
  const player = this;
  
  // Crear el botón personalizado usando la sintaxis moderna de Video.js
  class SubtitleUploadButton extends videojs.getComponent('Button') {
    constructor(player, options) {
      super(player, options);
      this.addClass('vjs-subtitle-upload-button');
      this.controlText('Cargar Subtítulos');
    }

    createEl() {
      const button = super.createEl('button', {
        className: 'vjs-subtitle-upload-button vjs-control vjs-button',
        innerHTML: `
          <span class="vjs-icon-placeholder" aria-hidden="true">
            <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
              <path d="M44,6H4A2,2,0,0,0,2,8V40a2,2,0,0,0,2,2H44a2,2,0,0,0,2-2V8A2,2,0,0,0,44,6ZM42,38H6V10H42Z"></path>
              <path d="M12,36H26a2,2,0,0,0,0-4H12a2,2,0,0,0,0,4Z"></path>
              <path d="M36,32H32a2,2,0,0,0,0,4h4a2,2,0,0,0,0-4Z"></path>
              <path d="M22,30H36a2,2,0,0,0,0-4H22a2,2,0,0,0,0,4Z"></path>
              <path d="M12,30h4a2,2,0,0,0,0-4H12a2,2,0,0,0,0,4Z"></path>
            </svg>
          </span>
          <span class="vjs-control-text">Cargar Subtítulos</span>
        `
      });
      
      // Crear input file oculto
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.srt,.vtt,.ass,.ssa';
      fileInput.style.display = 'none';
      
      // Agregar el input al botón
      button.appendChild(fileInput);
      
      return button;
    }

    handleClick() {
      const fileInput = this.el().querySelector('input[type="file"]');
      fileInput.click();
      
      fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file && options.onFileSelected) {
          options.onFileSelected(file);
        }
      };
    }
  }

  // Registrar el componente
  videojs.registerComponent('SubtitleUploadButton', SubtitleUploadButton);

  // Agregar el botón a la barra de control
  player.ready(() => {
    const subtitleUploadButton = new SubtitleUploadButton(player, options);
    
    // Insertar el botón antes del botón de pantalla completa
    const controlBar = player.controlBar;
    const fullscreenToggle = controlBar.fullscreenToggle;
    
    if (fullscreenToggle) {
      controlBar.el().insertBefore(
        subtitleUploadButton.el(), 
        fullscreenToggle.el()
      );
    } else {
      controlBar.el().appendChild(subtitleUploadButton.el());
    }
  });
};

// Registrar el plugin
videojs.registerPlugin('subtitleUpload', SubtitleUploadPlugin);

export default SubtitleUploadPlugin;