import Image from 'next/image';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-black border-t border-gray-800 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col items-center space-y-6">
          <div className="text-center space-y-2">
            <p className="text-gray-400 text-sm max-w-2xl">
              Este sitio no almacena ningún archivo en nuestro servidor, solo enlazamos al contenido alojado en servicios de terceros.
            </p>
            <Link 
              href="/dmca" 
              className="text-red-400 hover:text-red-300 text-sm underline transition-colors inline-block"
            >
              Política DMCA y Copyright
            </Link>
          </div>

          {/* TMDb Attribution */}
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
            <Image
              src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg"
              alt="TMDb Logo"
              width={60}
              height={30}
              className="opacity-80"
            />
            <p className="text-gray-400 text-xs text-center">
              Este producto utiliza la API de TMDb pero no está respaldado ni certificado por TMDb.
            </p>
          </div>
          
          {/* Copyright */}
          <div className="text-center border-t border-gray-800 pt-4 w-full">
            <p className="text-gray-500 text-sm">
              © 2025 CineParaTodos. Todos los derechos reservados.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}