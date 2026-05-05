export default function NotAuthorizedPage() {
  return (
    <div className="flex min-h-[calc(100vh-57px)] items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Access denied</h1>
        <p className="text-ink-muted mb-6">Your account doesn&apos;t have access to this area.</p>
        <a href="/" className="btn-outline">Back to home</a>
      </div>
    </div>
  );
}
