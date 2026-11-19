/**
 * Confirmation for destructive actions (REQ-REC-12a, REQ-NAV-8a).
 *
 * Cancelling a ride and deleting a log are both irreversible, and both
 * are a single tap away on a mounted phone.
 */

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onDismiss,
}: ConfirmDialogProps) {
  return (
    <div class="scrim" onClick={onDismiss}>
      <div
        class="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{title}</h2>
        <p>{message}</p>
        <div class="dialog-actions">
          {/* Dismiss first, so the destructive button is not under the
              thumb that just opened the dialog. */}
          <button type="button" class="btn" onClick={onDismiss}>
            Keep
          </button>
          <button type="button" class="btn btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
