/**
 * The earlier zero1office prototype (employees, companies, subscriptions and
 * expenses), shown as-is until each page is rebuilt in the real app.
 * It runs on sample data only; nothing here reads or writes the app's data.
 */
export default function PreviewPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        Preview of pages not yet rebuilt in the app (employees, companies, subscriptions, expenses). Sample data only.
      </div>
      <iframe
        title="zero1office prototype pages"
        src={`${import.meta.env.BASE_URL}more/index.html`}
        className="min-h-0 w-full flex-1 border-0"
      />
    </div>
  );
}
