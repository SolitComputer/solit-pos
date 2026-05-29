export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
      {children}
    </>
  );
}