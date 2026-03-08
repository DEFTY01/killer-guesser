interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
}

export function Card({ children, className = "", title, description }: CardProps) {
  return (
    <div
      className={[
        "rounded-2xl border bg-white p-6 shadow-sm",
        className,
      ].join(" ")}
    >
      {(title || description) && (
        <div className="mb-4">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {description && (
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
