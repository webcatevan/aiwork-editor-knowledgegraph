import type { ArticleLibrary } from './article-library.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    kgLibrary?: ArticleLibrary
  }
}