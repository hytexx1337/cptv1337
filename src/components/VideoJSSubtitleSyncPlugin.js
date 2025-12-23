/**
 * Plugin de Video.js para agregar botón de configuración de subtítulos
 * Se integra en el menú de subtítulos existente
 */

import { logger } from '@/lib/logger';
import videojs from 'video.js';

// Logger simple para JS (compatible con el sistema de logging)
const IS_DEBUG = typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_DEBUG !== undefined
  ? process.env.NEXT_PUBLIC_DEBUG === 'true'
  : typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';

const log = (...args) => IS_DEBUG && log(...args);

const Plugin = videojs.getPlugin('plugin');

class SubtitleSyncPlugin extends Plugin {
  constructor(player, options) {
    super(player, options);
    
    this.player = player;
    this.offset = 0;
    this.trackChangeListener = null;
    
    // Esperar a que el player esté listo
    this.player.ready(() => {
      this.addSettingsButton();
      this.setupTrackChangeListener();
    });
  }

  addSettingsButton() {
    const player = this.player;
    let attempts = 0;
    const maxAttempts = 100; // 100 intentos * 200ms = 20 segundos máximo
    
    // Esperar a que el menú de subtítulos esté disponible Y haya al menos un track cargado
    const checkMenu = () => {
      attempts++;
      
      // Timeout después de muchos intentos - forzar reload del player
      if (attempts > maxAttempts) {
        logger.warn('⚠️ [SUBTITLE-SETTINGS] Timeout esperando botón de subtítulos. Forzando reload del player...');
        
        // Forzar reload silencioso del player incrementando el audioSwitchKey
        try {
          window.dispatchEvent(new CustomEvent('forcePlayerReload', {
            detail: { reason: 'subtitle-button-timeout' }
          }));
          logger.log('🔄 [SUBTITLE-SETTINGS] Evento de reload disparado');
        } catch (error) {
          logger.error('❌ [SUBTITLE-SETTINGS] Error al forzar reload:', error);
        }
        return;
      }

      // Verificar que el control bar exista y esté completamente inicializado
      if (!player || !player.controlBar || !player.controlBar.el_) {
        setTimeout(checkMenu, 200);
        return;
      }

      // Intentar obtener el botón de subtítulos de forma segura (múltiples métodos)
      let textTrackButton = null;
      try {
        // Método 1: Usar getChild (API de Video.js)
        textTrackButton = player.controlBar.getChild('SubsCapsButton') || 
                         player.controlBar.getChild('SubtitlesButton') ||
                         player.controlBar.getChild('CaptionsButton');
        
        // Método 2: Buscar directamente en el DOM si getChild falla
        if (!textTrackButton) {
          const playerEl = player.el();
          const subsButtonEl = playerEl?.querySelector('.vjs-subs-caps-button, .vjs-subtitles-button, .vjs-captions-button');
          
          if (subsButtonEl) {
            // Intentar obtener el componente de Video.js desde el elemento DOM
            textTrackButton = videojs.getComponent('Component').prototype.el_.call({ el_: subsButtonEl });
            log('🔍 [SUBTITLE-SETTINGS] Botón encontrado vía DOM (método 2)');
          }
        }
      } catch (error) {
        logger.warn('⚠️ [SUBTITLE-SETTINGS] Error obteniendo botón:', error);
        setTimeout(checkMenu, 200);
        return;
      }
      
      if (!textTrackButton) {
        setTimeout(checkMenu, 200);
        return;
      }

      // Intentar obtener el menú de múltiples formas
      let menu = textTrackButton.menu;
      if (!menu) {
        // Buscar el menú directamente en el DOM
        const playerEl = player.el();
        const menuEl = playerEl?.querySelector('.vjs-subtitles-button .vjs-menu, .vjs-subs-caps-button .vjs-menu');
        if (menuEl) {
          // Crear objeto menu compatible
          menu = {
            contentEl: () => menuEl.querySelector('.vjs-menu-content'),
            hide: () => menuEl.classList.add('vjs-hidden')
          };
          log('🔍 [SUBTITLE-SETTINGS] Menú encontrado vía DOM');
        } else {
          setTimeout(checkMenu, 200);
          return;
        }
      }

      // CAMBIO: Permitir que el botón aparezca siempre, incluso sin subtítulos
      // Esto permite búsqueda manual cuando la automática falla
      const tracks = player.textTracks();
      const hasSubtitles = Array.from(tracks).some(track => 
        track.kind === 'subtitles' || track.kind === 'captions'
      );
      
      // Solo mostrar mensaje de debug, pero no bloquear el botón
      if (!hasSubtitles) {
        log('ℹ️ [SUBTITLE-SETTINGS] No hay subtítulos cargados, pero mostrando botón para búsqueda manual');
      }

      // Verificar si ya agregamos el botón y eliminarlo para reinicializar
      const existingBtn = menu.contentEl().querySelector('.vjs-subtitle-settings-btn');
      if (existingBtn) {
        log('🔄 [SUBTITLE-SETTINGS] Botón existente encontrado, eliminando para reinicializar...');
        existingBtn.remove();
      }

      // Crear el botón de configuración usando la misma estructura que los items nativos
      const settingsBtn = document.createElement('li');
      settingsBtn.className = 'vjs-menu-item vjs-subtitle-settings-btn';
      settingsBtn.setAttribute('tabindex', '-1');
      settingsBtn.setAttribute('role', 'menuitem');
      settingsBtn.style.borderTop = '1px solid rgba(255,255,255,0.1)';
      
      const settingsTextContent = document.createElement('span');
      settingsTextContent.className = 'vjs-menu-item-text';
      settingsTextContent.textContent = 'Configuración';
      
      settingsBtn.appendChild(settingsTextContent);

      // Agregar estilos hover
      if (!document.getElementById('vjs-subtitle-settings-style')) {
        const style = document.createElement('style');
        style.id = 'vjs-subtitle-settings-style';
        style.textContent = `
          .vjs-subtitle-settings-btn:hover {
            background: rgba(255,255,255,0.1) !important;
          }
        `;
        document.head.appendChild(style);
      }

      // Agregar event listeners
      log('✅ [SUBTITLE-SETTINGS] Botón agregado, esperando interacción...');
      
      // Prevenir que el menú se cierre al hacer hover sobre nuestro botón
      settingsBtn.addEventListener('mouseenter', (e) => {
        e.stopPropagation();
        log('🖱️ [SUBTITLE-SETTINGS] Mouse sobre botón');
      });
      
      settingsBtn.addEventListener('mouseleave', (e) => {
        e.stopPropagation();
        log('🖱️ [SUBTITLE-SETTINGS] Mouse fuera de botón');
      });
      
      // Usar mousedown en lugar de click para capturar antes de que se cierre el menú
      settingsBtn.addEventListener('mousedown', (e) => {
        log('🖱️ [SUBTITLE-SETTINGS] MOUSEDOWN detectado');
        e.stopPropagation();
        e.preventDefault();
        
        // Cerrar el menú de subtítulos inmediatamente
        try {
          if (textTrackButton && textTrackButton.menu) {
            log('🔄 [SUBTITLE-SETTINGS] Cerrando menú...');
            textTrackButton.menu.hide();
            log('✅ [SUBTITLE-SETTINGS] Menú cerrado');
          }
        } catch (err) {
          logger.warn('⚠️ [SUBTITLE-SETTINGS] No se pudo cerrar menú:', err);
        }
        
        // Pequeño delay para asegurar que el menú se cerró
        setTimeout(() => {
          log('📤 [SUBTITLE-SETTINGS] Dispatching evento...');
          
          // Dispatch custom event que el componente React escuchará
          const event = new CustomEvent('openSubtitleSettings', {
            detail: { offset: this.offset },
            bubbles: true,
            cancelable: true
          });
          window.dispatchEvent(event);
          
          log('✅ [SUBTITLE-SETTINGS] Evento dispatched correctamente');
        }, 100); // Aumentado a 100ms
      }, true); // useCapture = true para capturar en fase de captura
      
      // También capturar click y touchstart como backup
      settingsBtn.addEventListener('click', (e) => {
        log('🖱️ [SUBTITLE-SETTINGS] CLICK detectado (backup)');
        e.stopPropagation();
        e.preventDefault();
      }, true);
      
      settingsBtn.addEventListener('touchstart', (e) => {
        log('📱 [SUBTITLE-SETTINGS] TOUCHSTART detectado');
        e.stopPropagation();
        e.preventDefault();
        
        // Mismo comportamiento que mousedown
        try {
          if (textTrackButton && textTrackButton.menu) {
            textTrackButton.menu.hide();
          }
        } catch (err) {
          logger.warn('⚠️ [SUBTITLE-SETTINGS] No se pudo cerrar menú:', err);
        }
        
        setTimeout(() => {
          const event = new CustomEvent('openSubtitleSettings', {
            detail: { offset: this.offset },
            bubbles: true,
            cancelable: true
          });
          window.dispatchEvent(event);
        }, 100);
      }, { passive: false });

      // Insertar al final del menú (dentro del <ul>)
      const menuContent = menu.contentEl();
      
      // Debug: verificar dónde estamos agregando el botón
      log('📍 [SUBTITLE-SETTINGS] MenuContent elemento:', menuContent);
      log('📍 [SUBTITLE-SETTINGS] MenuContent tag:', menuContent?.tagName);
      log('📍 [SUBTITLE-SETTINGS] MenuContent classes:', menuContent?.className);
      
      menuContent.appendChild(settingsBtn);

      log('✅ [SUBTITLE-SYNC] Botón de configuración agregado al menú');
      
      // Verificar posición final
      const btnParent = settingsBtn.parentElement;
      log('📍 [SUBTITLE-SETTINGS] Botón padre después de agregar:', btnParent?.className);
    };

    checkMenu();
  }

  setupTrackChangeListener() {
    const player = this.player;
    
    // Escuchar cuando se agregan nuevos tracks
    this.trackChangeListener = () => {
      log('🔄 [SUBTITLE-SETTINGS] Track change detectado, re-agregando botón...');
      // Pequeño delay para asegurar que el menú se haya actualizado
      setTimeout(() => {
        this.addSettingsButton();
      }, 500);
    };
    
    // Escuchar eventos de cambio en los text tracks
    player.textTracks().addEventListener('addtrack', this.trackChangeListener);
    player.textTracks().addEventListener('removetrack', this.trackChangeListener);
    
    // También escuchar cuando se carga un nuevo track remoto
    player.on('loadeddata', this.trackChangeListener);
    player.on('texttrackchange', this.trackChangeListener);
  }

  adjustOffset(adjustment) {
    this.offset += adjustment;
    log(`🔄 [SUBTITLE-SYNC] Nuevo offset: ${this.offset}s`);
    this.applyOffset();
  }

  resetOffset() {
    this.offset = 0;
    log('🔄 [SUBTITLE-SYNC] Offset reseteado');
    this.applyOffset();
  }

  applyOffset() {
    const tracks = this.player.textTracks();
    const tracksArray = Array.from(tracks);
    
    tracksArray.forEach((track) => {
      if (track.mode === 'showing' && track.cues) {
        const cuesArray = Array.from(track.cues);
        cuesArray.forEach((cue) => {
          // Guardar tiempos originales
          if (!cue.__originalStartTime) {
            cue.__originalStartTime = cue.startTime;
            cue.__originalEndTime = cue.endTime;
          }
          
          // Aplicar offset
          cue.startTime = cue.__originalStartTime + this.offset;
          cue.endTime = cue.__originalEndTime + this.offset;
        });
      }
    });
  }

  // Método para aplicar configuración externa (desde el modal)
  applySettings(settings) {
    this.offset = settings.offset || 0;
    this.applyOffset();
    log('✅ [SUBTITLE-SYNC] Configuración aplicada:', settings);
  }

  dispose() {
    // Limpiar event listeners
    if (this.trackChangeListener) {
      const player = this.player;
      if (player && player.textTracks) {
        player.textTracks().removeEventListener('addtrack', this.trackChangeListener);
        player.textTracks().removeEventListener('removetrack', this.trackChangeListener);
      }
      if (player) {
        player.off('loadeddata', this.trackChangeListener);
        player.off('texttrackchange', this.trackChangeListener);
      }
    }
    
    super.dispose();
  }
}

// Registrar el plugin
videojs.registerPlugin('subtitleSync', SubtitleSyncPlugin);

export default SubtitleSyncPlugin;
