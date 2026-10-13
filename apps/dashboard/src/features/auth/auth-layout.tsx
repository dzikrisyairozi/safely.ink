import { type ReactNode } from 'react';
import { Card, CardContent } from '@repo/ui/components/ui/card';
import { AppTitle } from '../../components/layout/app-title';

export function AuthLayout({
  children,
  title,
  description,
}: {
  children: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div className="relative z-10 w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <AppTitle />
        </div>
        <Card>
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-1.5 text-center">
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            {children}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
