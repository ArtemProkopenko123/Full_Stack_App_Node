# @artemprokopenko/ui

React UI components built on Radix primitives and Tailwind CSS v4 (shadcn-style).

## Install

```bash
npm install @artemprokopenko/ui
```

Peer dependencies: `react` ^19 and `react-dom` ^19. Your app must use Tailwind CSS v4.

## Setup

Import the stylesheet (design tokens, dark theme, animations) after Tailwind in your main CSS file:

```css
@import "tailwindcss";
@import "@artemprokopenko/ui/styles.css";
```

Override any token (`--primary`, `--radius`, ...) in your own `:root` / `.dark` to theme the components.
Add the `dark` class to `<html>` to enable the dark theme.

## Usage

```tsx
import { Button, Card, CardContent, Input } from "@artemprokopenko/ui"

export function Example() {
  return (
    <Card>
      <CardContent>
        <Input placeholder="Title" />
        <Button variant="outline">Save</Button>
      </CardContent>
    </Card>
  )
}
```

## Components

Button, Card, Input, Select, Textarea, plus the `cn` class-name helper and `buttonVariants`.
