import MessageValidator from 'sns-validator';

// R004: verifies the inbound SNS notification's signature per AWS's own mechanism
// (fetch SigningCertURL over HTTPS, verify the RSA signature, SignatureVersion-aware).
const validator = new MessageValidator();

export function validateSnsMessage(message: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    validator.validate(message as never, (err: Error | null, validatedMessage?: unknown) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(validatedMessage);
    });
  });
}
