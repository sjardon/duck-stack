const FEATURES = [
  { title: 'Authentication', description: 'Secure user sign-up and sign-in out of the box.' },
  { title: 'Subscriptions', description: 'Flexible billing plans powered by Stripe.' },
  { title: 'Payments', description: 'Accept one-time and recurring payments with ease.' },
];

export default function Features(): JSX.Element {
  return (
    <section>
      <h2>Everything you need</h2>
      <ul>
        {FEATURES.map((feature) => (
          <li key={feature.title}>
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
