const structuredToolResultNotice = 'Result returned in structuredContent.';

export function toolOutputText(output: unknown): string | undefined {
  if (typeof output === 'string') {
    return output;
  }

  if (Array.isArray(output)) {
    return output
      .map((entry) => toolOutputText(entry))
      .filter(Boolean)
      .join('\n\n') || undefined;
  }

  if (!isRecord(output)) {
    return output === undefined ? undefined : JSON.stringify(output);
  }

  const structuredText = 'structuredContent' in output ? toolOutputText(output.structuredContent) : undefined;
  if (structuredText) {
    const contentText = toolOutputContentText(output);
    if (!contentText || contentText.trim() === structuredToolResultNotice) {
      return structuredText;
    }

    return `${contentText}\n\n${structuredText}`;
  }

  return toolOutputContentText(output) ?? JSON.stringify(output);
}

function toolOutputContentText(output: Record<string, unknown>): string | undefined {
  if (typeof output.text === 'string') {
    return output.text;
  }

  if (typeof output.content === 'string') {
    return output.content;
  }

  if (Array.isArray(output.content)) {
    return toolOutputText(output.content);
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
