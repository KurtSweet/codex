(function () {
  const inputArea = document.getElementById('input-area');
  const outputArea = document.getElementById('output-area');
  const copyButton = document.getElementById('copy-button');
  const clearButton = document.getElementById('clear-button');
  const status = document.getElementById('status');

  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function updateOutput() {
    const html = inputArea.innerHTML.trim();
    if (!html) {
      outputArea.value = '';
      setStatus('');
      return;
    }

    try {
      const markdown = convertHtmlToMarkdown(html);
      outputArea.value = markdown;
      setStatus(`Last updated ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      console.error(error);
      setStatus('Could not convert the pasted content. Please try again.', true);
    }
  }

  const debouncedUpdate = debounce(updateOutput, 80);

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('error', isError);
    status.classList.toggle('success', Boolean(message && !isError));
  }

  inputArea.addEventListener('input', debouncedUpdate);
  inputArea.addEventListener('keyup', debouncedUpdate);
  inputArea.addEventListener('paste', () => {
    window.setTimeout(updateOutput, 10);
  });

  clearButton.addEventListener('click', () => {
    inputArea.innerHTML = '';
    outputArea.value = '';
    inputArea.focus();
    setStatus('Cleared.');
  });

  copyButton.addEventListener('click', async () => {
    if (!outputArea.value) {
      setStatus('Nothing to copy yet.', true);
      return;
    }

    try {
      await navigator.clipboard.writeText(outputArea.value);
      setStatus('Markdown copied to clipboard!');
    } catch (error) {
      console.error(error);
      outputArea.select();
      document.execCommand('copy');
      setStatus('Markdown copied to clipboard.');
    }
  });

  function convertHtmlToMarkdown(html) {
    const sanitized = sanitizeHtml(html);
    if (!sanitized) {
      return '';
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${sanitized}</div>`, 'text/html');
    const root = doc.body;
    const state = { listDepth: 0, inCodeBlock: false, inInlineCode: false };
    const markdown = renderChildren(root, state);
    return collapseBlankLines(markdown).trimEnd();
  }

  function sanitizeHtml(html) {
    return html
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '');
  }

  function renderChildren(parent, state) {
    let buffer = '';
    parent.childNodes.forEach((child) => {
      buffer += renderNode(child, state);
    });
    return buffer;
  }

  function renderNode(node, state) {
    if (node.nodeType === Node.TEXT_NODE) {
      return state.inCodeBlock || state.inInlineCode
        ? node.nodeValue
        : escapeMarkdown(node.nodeValue);
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const tag = node.tagName.toLowerCase();
    switch (tag) {
      case 'p':
      case 'div': {
        const content = renderChildren(node, state).trim();
        return content ? `${content}\n\n` : '';
      }
      case 'br':
        return '  \n';
      case 'strong':
      case 'b':
        return wrapInline(node, state, '**');
      case 'em':
      case 'i':
        return wrapInline(node, state, '*');
      case 'u':
        return wrapInline(node, state, '__');
      case 's':
      case 'del':
        return wrapInline(node, state, '~~');
      case 'code':
        if (state.inCodeBlock) {
          return node.textContent;
        }
        return renderInlineCode(node, state);
      case 'pre':
        return renderPreformatted(node);
      case 'blockquote':
        return renderBlockQuote(node, state);
      case 'ul':
        return renderList(node, state, { ordered: false });
      case 'ol':
        return renderList(node, state, { ordered: true });
      case 'li': {
        return renderChildren(node, state).trim();
      }
      case 'a':
        return renderLink(node, state);
      case 'img':
        return renderImage(node);
      case 'hr':
        return '\n---\n\n';
      case 'span':
      case 'font':
      case 'small':
      case 'big':
        return renderChildren(node, state);
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': {
        const level = Number(tag[1]);
        const content = renderChildren(node, state).trim();
        return content ? `${'#'.repeat(level)} ${content}\n\n` : '';
      }
      case 'table':
        return renderTable(node, state);
      case 'thead':
      case 'tbody':
      case 'tfoot':
      case 'tr':
      case 'th':
      case 'td':
        // Table rendering handled at the table level.
        return '';
      default:
        return renderChildren(node, state);
    }
  }

    function renderPreformatted(node) {
      const codeNode = node.querySelector('code');
      const language = extractLanguage(codeNode);
      const text = codeNode ? codeNode.textContent : node.textContent;
    const trimmed = text.replace(/\s+$/, '');
    const content = trimmed.replace(/\r\n/g, '\n');
    return `\n\`\`\`${language}\n${content}\n\`\`\`\n\n`;
  }

  function extractLanguage(codeNode) {
    if (!codeNode || !codeNode.className) {
      return '';
    }
    const match = codeNode.className.match(/language-([a-z0-9]+)/i);
    return match ? match[1] : '';
  }

  function renderBlockQuote(node, state) {
    const content = renderChildren(node, state).trim();
    if (!content) {
      return '';
    }
    return content
      .split(/\r?\n/)
      .map((line) => `> ${line}`)
      .join('\n')
      .concat('\n\n');
  }

  function renderList(node, state, options) {
    const depth = state.listDepth || 0;
    const indent = '  '.repeat(depth);
    const items = [];
    let index = options.ordered ? Number(node.getAttribute('start') || 1) : 1;

    node.childNodes.forEach((child) => {
      if (child.nodeType !== Node.ELEMENT_NODE || child.tagName.toLowerCase() !== 'li') {
        return;
      }

      const marker = options.ordered ? `${index}. ` : '- ';
      index += 1;
      const childState = { ...state, listDepth: depth + 1 };
      const rendered = renderChildren(child, childState).trim();
      if (!rendered) {
        return;
      }
      const lines = rendered.split(/\r?\n/);
      const formatted = [indent + marker + lines[0]];
      for (let i = 1; i < lines.length; i += 1) {
        formatted.push(indent + '  ' + lines[i]);
      }
      items.push(formatted.join('\n'));
    });

    if (!items.length) {
      return '';
    }

    return items.join('\n') + '\n\n';
  }

  function wrapInline(node, state, wrapper) {
    const content = renderChildren(node, state).trim();
    return content ? `${wrapper}${content}${wrapper}` : '';
  }

  function renderInlineCode(node, state) {
    const text = renderChildren(node, { ...state, inInlineCode: true });
    if (!text) {
      return '';
    }
    const normalised = text.replace(/\r\n?/g, '\n').replace(/\n/g, ' ');
    const trimmed = normalised.trim();
    const leading = normalised.startsWith(' ');
    const trailing = normalised.endsWith(' ');
    let content = trimmed;
    if (leading && !trimmed.startsWith(' ')) {
      content = ` ${content}`;
    }
    if (trailing && !trimmed.endsWith(' ')) {
      content = `${content} `;
    }
    const needsDoubleTicks = content.includes('`');
    const fence = needsDoubleTicks ? '``' : '`';
    return `${fence}${content}${fence}`;
  }

  function renderLink(node, state) {
    const href = node.getAttribute('href') || '';
    const title = node.getAttribute('title');
    const text = renderChildren(node, state).trim() || href;
    const sanitizedHref = href.replace(/\s/g, '%20');
    if (title) {
      return `[${text}](${sanitizedHref} "${escapeMarkdown(title)}")`;
    }
    return `[${text}](${sanitizedHref || '#'})`;
  }

  function renderImage(node) {
    const src = node.getAttribute('src') || '';
    const alt = node.getAttribute('alt') || '';
    return `![${escapeMarkdown(alt)}](${src})`;
  }

  function renderTable(table, state) {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (!rows.length) {
      return '';
    }

    const headerRow =
      table.querySelector('thead tr') || rows.find((row) => row.querySelector('th'));
    const bodyRows = headerRow ? rows.filter((row) => row !== headerRow) : rows;

    const renderRow = (row) =>
      Array.from(row.querySelectorAll('th, td'))
        .map((cell) => renderChildren(cell, state).trim() || ' ')
        .join(' | ');

    let markdown = '';
    if (headerRow) {
      const header = renderRow(headerRow);
      const divider = header
        .split('|')
        .map(() => ' --- ')
        .join('|');
      markdown += `${header}\n${divider}\n`;
    }

    if (bodyRows.length) {
      markdown += bodyRows.map((row) => renderRow(row)).join('\n');
    }

    return markdown ? `${markdown}\n\n` : '';
  }

  function collapseBlankLines(markdown) {
    return markdown.replace(/\n{3,}/g, '\n\n');
  }

  function escapeMarkdown(value) {
    return value
      .replace(/[\u00a0]/g, ' ')
      .replace(/([\\`*_{}[\]()#+\-.!>])/g, '\\$1');
  }

  // Prime the converter with any default content.
  updateOutput();
})();
