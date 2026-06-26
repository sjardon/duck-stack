interface CancelDialogProps {
  open: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
  loading: boolean;
}

export default function CancelDialog({
  open,
  onConfirm,
  onDismiss,
  loading,
}: CancelDialogProps): JSX.Element | null {
  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true">
      <p>Are you sure you want to cancel your subscription?</p>
      <button disabled={loading} onClick={onConfirm}>
        Confirm
      </button>
      <button onClick={onDismiss}>Dismiss</button>
    </div>
  );
}
