// Non-business example template exercising the send-to-delivery flow end to end (R009).
// Deliberately minimal — no shared component library, no styling system.
export function ExamplePingEmail({
  recipientName,
  sentAt,
}: {
  recipientName: string;
  sentAt: string;
}) {
  return (
    <html>
      <body>
        <p>Hi {recipientName},</p>
        <p>This is a ping email sent at {sentAt}.</p>
      </body>
    </html>
  );
}
