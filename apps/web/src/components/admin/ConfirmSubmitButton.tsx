"use client";

type ConfirmSubmitButtonProps = {
  label: string;
  message: string;
};

export default function ConfirmSubmitButton({ label, message }: ConfirmSubmitButtonProps) {
  return (
    <button
      className="secondary-button"
      type="submit"
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {label}
    </button>
  );
}
