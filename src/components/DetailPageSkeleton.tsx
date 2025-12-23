export default function DetailPageSkeleton() {
  return (
    <div className="min-h-screen bg-black">
      {/* Backdrop Skeleton */}
      <div className="relative h-screen">
        <div className="absolute inset-0 bg-gradient-to-b from-gray-800 via-gray-800 to-black animate-pulse" />
        
        {/* Overlay negro */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent" />
        
        {/* Content Skeleton */}
        <div className="relative z-10 flex items-end h-full">
          <div className="w-full px-4 md:px-8 pb-20 space-y-6">
            {/* Logo/Title Skeleton */}
            <div className="h-32 w-96 bg-gray-700 rounded-lg animate-pulse" />
            
            {/* Metadata Skeleton */}
            <div className="flex items-center gap-4">
              <div className="h-6 w-20 bg-gray-700 rounded animate-pulse" />
              <div className="h-6 w-16 bg-gray-700 rounded animate-pulse" />
              <div className="h-6 w-24 bg-gray-700 rounded animate-pulse" />
            </div>
            
            {/* Overview Skeleton */}
            <div className="space-y-2 max-w-3xl">
              <div className="h-4 bg-gray-700 rounded animate-pulse w-full" />
              <div className="h-4 bg-gray-700 rounded animate-pulse w-5/6" />
              <div className="h-4 bg-gray-700 rounded animate-pulse w-4/6" />
            </div>
            
            {/* Buttons Skeleton */}
            <div className="flex gap-4">
              <div className="h-12 w-32 bg-gray-700 rounded-lg animate-pulse" />
              <div className="h-12 w-32 bg-gray-700 rounded-lg animate-pulse" />
            </div>
          </div>
        </div>
      </div>
      
      {/* Cast Carousel Skeleton */}
      <div className="px-4 md:px-8 py-12">
        <div className="h-8 w-32 bg-gray-700 rounded animate-pulse mb-6" />
        <div className="flex gap-4 overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex-shrink-0 w-32">
              <div className="aspect-[2/3] bg-gray-700 rounded-lg animate-pulse mb-2" />
              <div className="h-4 bg-gray-700 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
      
      {/* Similar Content Skeleton */}
      <div className="px-4 md:px-8 py-12">
        <div className="h-8 w-48 bg-gray-700 rounded animate-pulse mb-6" />
        <div className="flex gap-4 overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex-shrink-0 w-40">
              <div className="aspect-[2/3] bg-gray-700 rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

