'use client';

import React from 'react';

export const Footer = () => {
  return (
    <footer className="bg-card border-t -mt-16 py-4 text-center text-muted-foreground text-sm">
      <div className="container mx-auto px-4">
        © {new Date().getFullYear()} EasyManage. Todos los derechos reservados.
      </div>
    </footer>
  );
};
