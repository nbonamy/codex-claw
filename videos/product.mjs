// Standalone films use the same brand definition as the app and website.
const response = await fetch(
  new URL("../core/src/product.json", import.meta.url),
);
if (!response.ok) throw new Error("Product metadata could not be loaded.");
export const product = await response.json();

const replace = (value) => value.replaceAll("__PRODUCT_NAME__", product.name);
const textNodes = document.createTreeWalker(document, NodeFilter.SHOW_TEXT);
while (textNodes.nextNode()) {
  textNodes.currentNode.textContent = replace(
    textNodes.currentNode.textContent,
  );
}
for (const element of document.querySelectorAll("*")) {
  for (const attribute of [...element.attributes]) {
    const value = replace(attribute.value);
    if (value !== attribute.value) element.setAttribute(attribute.name, value);
  }
}
