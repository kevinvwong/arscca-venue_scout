export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-57px)] items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <p className="text-6xl font-bold text-gray-200 tabular-nums mb-4">404</p>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Page not found</h1>
        <p className="text-sm text-gray-500 mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <a href="/admin" className="btn btn-primary px-5 py-2 text-sm">
          Go to dashboard
        </a>
      </div>
    </div>
  );
}
