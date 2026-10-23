export function InfoToast({message}: {message: string}) {
  if (!message) return null;
  return (
    <div className="toast-overlay">
      <div className="toast">{message}</div>
    </div>
  );
}
