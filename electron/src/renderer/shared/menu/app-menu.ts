import type { Component } from 'vue';

type AppMenuItemBase = {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
  icon?: Component;
  value?: string;
};

export type AppMenuActionItem = AppMenuItemBase & {
  type: 'action';
  danger?: boolean;
  leadingColor?: string;
};

export type AppMenuCheckboxItem = AppMenuItemBase & {
  type: 'checkbox';
  accessory?: 'check' | 'switch';
  checked: boolean;
};

export type AppMenuRadioItem = AppMenuItemBase & {
  type: 'radio';
  checked: boolean;
};

export type AppMenuSubmenuItem = AppMenuItemBase & {
  type: 'submenu';
  items: AppMenuItem[];
  submenuWidth?: 'default' | 'wide';
};

export type AppMenuSeparatorItem = {
  id: string;
  type: 'separator';
};

export type AppMenuItem =
  | AppMenuActionItem
  | AppMenuCheckboxItem
  | AppMenuRadioItem
  | AppMenuSeparatorItem
  | AppMenuSubmenuItem;
