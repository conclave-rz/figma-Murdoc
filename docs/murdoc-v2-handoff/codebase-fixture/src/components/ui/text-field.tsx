export function TextField({ label }: { label: string }) {
  return (
    <label data-component="form/field/text" className="field-text">
      <span>{label}</span><input type="text" />
    </label>
  );
}
