# 🔥 better-use-debounce

**Promise-native React debounce hook with advanced control.**
Lightweight, no deps, and fully async/await ready.

---

## ✨ Features

* 🔁 **Promise-native API** – use with async/await directly
* 🧠 **Manual settlement** – resolve/reject pending calls on demand
* 🪶 **Zero dependencies** – under 2KB gzipped
* ❌ **Cancelable** – cancel with custom errors
* 🧼 **Safe unmount** – auto-cleanup

---

## 🛠️ Installation

Not an npm package — copy directly into your codebase.

---

## 🚀 Usage

```tsx
import { useDebouncedCallback } from './hooks/better-use-debounce';

function Search() {
  const search = useDebouncedCallback(
    async (query) => {
      const res = await fetch(`/api?q=${query}`);
      return res.json();
    },
    300
  );

  return (
    <input
      onChange={async (e) => {
        try {
          const results = await search(e.target.value);
          // Use results
        } catch (err) {
          // Handle errors
        }
      }}
    />
  );
}
```

---

## 🧩 Advanced Control

```tsx
search.cancel('User navigated away');       // Cancel
search.flush();                             // Run now
search.isPending();                         // Check pending
search.settlePendingWith(() => ({ data: 'latest' })); // Manual resolve
search.settlePendingWith(() => { throw new Error('Service down'); }); // Manual reject
```

---

## 🧪 API

```ts
useDebouncedCallback<T>(
  callback: T,
  delay: number,
  options?: { maxWait?: number }
): {
  (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>>;
  cancel(reason?: string | Error): void;
  flush(): void;
  isPending(): boolean;
  settlePendingWith(
    executor: () => ReturnType<T> | PromiseLike<ReturnType<T>>
  ): void;
}
```

---

## 💡 Why Better?

* ✅ Native Promise support
* ✅ Manual resolution
* ✅ No deps
* ✅ Small footprint
* ✅ Fine-grained control

---

## 📄 License

MIT
