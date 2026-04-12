export default function TransferListSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="grid grid-cols-12 items-center px-6 py-4 rounded-xl bg-[#001711]">
          <div className="col-span-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#002c22] animate-pulse" />
            <div className="space-y-2">
              <div className="h-4 w-32 bg-[#002c22] rounded animate-pulse" />
              <div className="h-3 w-24 bg-[#002c22] rounded animate-pulse" />
            </div>
          </div>
          <div className="col-span-2 text-center">
            <div className="h-4 w-16 bg-[#002c22] rounded animate-pulse mx-auto" />
          </div>
          <div className="col-span-2 text-center">
            <div className="h-4 w-12 bg-[#002c22] rounded animate-pulse mx-auto" />
          </div>
          <div className="col-span-2 text-center">
            <div className="h-5 w-16 bg-[#002c22] rounded animate-pulse mx-auto" />
          </div>
          <div className="col-span-1 flex justify-end">
            <div className="w-6 h-6 bg-[#002c22] rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}