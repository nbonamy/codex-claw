import { describe, expect, it } from 'vitest';
import {
  AppError,
  appErrorDescriptor,
  decodeAppErrorDescriptor,
  encodeAppErrorDescriptor,
  encodedAppError,
} from '../app-error';

describe('app error descriptors', () => {
  it('carries stable codes and interpolation parameters separately from fallback prose', () => {
    const error = new AppError('clone.alreadyExists', 'skills already exists in the source folder.', {
      repository: 'skills',
    });

    expect(appErrorDescriptor(error)).toStrictEqual({
      kind: 'appError',
      code: 'clone.alreadyExists',
      params: { repository: 'skills' },
    });
  });

  it('survives transports that preserve only an error message', () => {
    const descriptor = { kind: 'appError', code: 'clone.invalidName' } as const;
    const transported = new Error(`Error invoking remote method: ${encodeAppErrorDescriptor(descriptor, 'Invalid repository name.')}`);

    expect(decodeAppErrorDescriptor(transported)).toStrictEqual(descriptor);
  });

  it('encodes an RPC error descriptor while retaining its diagnostic fallback', () => {
    const error = Object.assign(new Error('Repository URL is required.'), {
      data: { kind: 'appError', code: 'clone.urlRequired' },
    });

    const encoded = encodedAppError(error);
    expect(encoded.message).toContain('Repository URL is required.');
    expect(decodeAppErrorDescriptor(encoded)).toStrictEqual({ kind: 'appError', code: 'clone.urlRequired' });
  });

  it('ignores malformed encoded descriptors', () => {
    expect(decodeAppErrorDescriptor('codex-claw-app-error:not-json broken')).toBeNull();
  });
});
