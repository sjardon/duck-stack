import Button from '../ui/Button';
import { captureEvent } from '../../lib/analytics';
import { buildHandoffUrl } from '../../lib/handoff';
import { CONVERSION_EVENT_NAME, hasConverted, markConverted } from '../../lib/conversion';

export default function CTA(): JSX.Element {
  const handleClick = (): void => {
    if (!hasConverted()) {
      captureEvent(CONVERSION_EVENT_NAME, { action: 'cta' });
      markConverted();
    }
    window.location.href = buildHandoffUrl('/sign-up');
  };

  return (
    <section>
      <h2>Ready to get started?</h2>
      <p>Join the waitlist and be the first to know when we launch.</p>
      <Button variant="primary" onClick={handleClick}>Get early access</Button>
    </section>
  );
}
