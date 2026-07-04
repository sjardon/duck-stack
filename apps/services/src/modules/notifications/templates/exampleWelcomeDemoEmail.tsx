import * as React from 'react';
import { Html, Head, Body, Container, Heading, Text, Hr } from '@react-email/components';

interface ExampleWelcomeDemoEmailProps {
  recipientName: string;
}

export function ExampleWelcomeDemoEmail({ recipientName }: ExampleWelcomeDemoEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Body style={{ fontFamily: 'sans-serif', backgroundColor: '#f9f9f9', padding: '24px' }}>
        <Container style={{ backgroundColor: '#ffffff', padding: '32px', borderRadius: '8px', maxWidth: '480px' }}>
          <Heading as="h1" style={{ color: '#1a1a1a', fontSize: '24px' }}>
            Welcome, {recipientName}!
          </Heading>
          <Hr />
          <Text style={{ color: '#444444', fontSize: '16px' }}>
            This is an example email from duck-stack. The notifications pipeline is working correctly.
          </Text>
          <Text style={{ color: '#888888', fontSize: '12px' }}>
            You received this email because a notification was triggered in the system.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
