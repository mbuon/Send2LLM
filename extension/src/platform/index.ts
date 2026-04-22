// BROWSER is injected by Vite at build time via define
declare const __BROWSER__: string;
export * from (__BROWSER__ === 'firefox' ? './mv2.js' : './mv3.js');
