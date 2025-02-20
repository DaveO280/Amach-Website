export default function IconPreview() {
  return (
    <div className="p-8 grid gap-8">
      <h1>Icon Preview</h1>
      
      {/* Original size */}
      <div>
        <h2>32x32 (Original)</h2>
        <img src="/icon.svg" width={32} height={32} alt="Icon" />
      </div>

      {/* Larger for detail */}
      <div>
        <h2>64x64</h2>
        <img src="/icon.svg" width={64} height={64} alt="Icon" />
      </div>

      {/* Browser tab simulation */}
      <div className="border rounded-t-lg w-48 p-2 flex items-center gap-2 bg-gray-100">
        <img src="/icon.svg" width={16} height={16} alt="Icon" />
        <span className="text-sm">Amach Health</span>
      </div>
    </div>
  );
}

export const metadata = {
  title: 'Icon Preview - Amach Health',
  description: 'Icon preview and testing page',
};
