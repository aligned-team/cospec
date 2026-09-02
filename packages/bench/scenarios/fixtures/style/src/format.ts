export function formatList(items: string[]) {
  return items
    .map(function (item) {
      return "- " + item;
    })
    .join("\n");
}

export const DEFAULTS = {
  limit: 10,
  sort: true
};
