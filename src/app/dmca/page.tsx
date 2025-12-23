import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'DMCA - Aviso de Copyright',
  description: 'Política DMCA y procedimiento para reportar contenido protegido por derechos de autor en CineParaTodos.',
};

export default function DMCAPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black text-white py-16 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            DMCA - Aviso de Copyright
          </h1>
          <p className="text-gray-400 text-lg">
            Política de Derechos de Autor Digital Millennium Copyright Act
          </p>
        </div>

        {/* Content */}
        <div className="space-y-8 text-gray-300 leading-relaxed">
          {/* Disclaimer Principal */}
          <section className="bg-red-900/20 border border-red-500/30 rounded-lg p-6">
            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
              <span>⚠️</span> Aviso Importante
            </h2>
            <p className="text-lg">
              <strong>CineParaTodos</strong> no almacena ningún archivo de video en nuestros servidores. 
              Únicamente proporcionamos enlaces a contenido alojado en servicios de terceros. 
              Actuamos como un motor de búsqueda y agregador de contenido disponible públicamente en Internet.
            </p>
          </section>

          {/* Política DMCA */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              Política DMCA
            </h2>
            <p className="mb-4">
              Respetamos los derechos de propiedad intelectual de otros y esperamos que nuestros usuarios hagan lo mismo. 
              De acuerdo con el Digital Millennium Copyright Act (DMCA), responderemos rápidamente a las reclamaciones 
              de infracción de derechos de autor cometidas usando nuestro sitio web.
            </p>
            <p>
              Si usted es un propietario de derechos de autor, o un agente del mismo, y cree que cualquier contenido 
              enlazado en nuestro sitio web infringe sus derechos de autor, puede enviar una notificación de infracción 
              a nuestro Agente Designado para Derechos de Autor.
            </p>
          </section>

          {/* Cómo reportar */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              Cómo Reportar Contenido Infractor
            </h2>
            <p className="mb-4">
              Para presentar una notificación de infracción, debe proporcionar la siguiente información por escrito:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-4">
              <li>
                Una firma física o electrónica de una persona autorizada para actuar en nombre del propietario 
                de un derecho exclusivo que supuestamente se ha infringido.
              </li>
              <li>
                Identificación de la obra protegida por derechos de autor que se reclama ha sido infringida.
              </li>
              <li>
                Identificación del material que se reclama como infractor y que debe ser eliminado, 
                incluyendo la URL específica donde se encuentra el enlace.
              </li>
              <li>
                Información de contacto razonablemente suficiente (dirección, teléfono, correo electrónico).
              </li>
              <li>
                Una declaración de que tiene una creencia de buena fe de que el uso del material de la manera 
                reclamada no está autorizado por el propietario de los derechos de autor, su agente o la ley.
              </li>
              <li>
                Una declaración de que la información en la notificación es precisa, y bajo pena de perjurio, 
                que usted está autorizado para actuar en nombre del propietario de un derecho exclusivo que 
                supuestamente se ha infringido.
              </li>
            </ul>
          </section>

          {/* Contacto */}
          <section className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <h2 className="text-2xl font-semibold text-white mb-4">
              Agente Designado para Derechos de Autor
            </h2>
            <div className="space-y-2">
              <p className="text-lg">
                <strong>Email:</strong>{' '}
                <a 
                  href="mailto:admin@cineparatodos.net" 
                  className="text-red-400 hover:text-red-300 underline transition-colors"
                >
                  admin@cineparatodos.net
                </a>
              </p>
              <p className="text-sm text-gray-400 mt-4">
                Asunto del correo: <span className="text-white font-mono">"DMCA Takedown Request"</span>
              </p>
            </div>
          </section>

          {/* Tiempo de respuesta */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              Tiempo de Respuesta
            </h2>
            <p>
              Nos comprometemos a responder a todas las notificaciones DMCA válidas dentro de las 
              <strong className="text-white"> 48-72 horas</strong> después de recibirlas. 
              Eliminaremos inmediatamente los enlaces al contenido infractor una vez verificada la solicitud.
            </p>
          </section>

          {/* Contra-notificación */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">
              Contra-notificación
            </h2>
            <p>
              Si cree que el contenido que fue eliminado no es infractor, o que tiene la autorización 
              del propietario de los derechos de autor para publicar y usar el material, puede enviar 
              una contra-notificación a la misma dirección de correo electrónico.
            </p>
          </section>

          {/* Nota final */}
          <section className="bg-gray-800/30 border border-gray-700 rounded-lg p-6 text-center">
            <p className="text-sm text-gray-400">
              Última actualización: Diciembre 2025
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Al usar CineParaTodos, usted acepta cumplir con esta política DMCA y nuestros términos de servicio.
            </p>
          </section>

          {/* Botón volver */}
          <div className="text-center pt-8">
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-lg font-semibold transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              ← Volver al Inicio
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

