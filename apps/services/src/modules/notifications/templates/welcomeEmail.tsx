import { Html, Head, Body, Container, Heading, Text } from '@react-email/components';
import type { WelcomeEmailContext } from '@repo/types';

export const welcomeEmailSubject = 'Welcome aboard!';

export function WelcomeEmail({ recipientName }: WelcomeEmailContext) {
  return (
    <Html>
      <Head />
      <Body>
        <Container>
          <Heading>Welcome aboard!</Heading>
          <Text>
            Hi {recipientName}, we are glad to have you with us. Your account is ready to go.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
