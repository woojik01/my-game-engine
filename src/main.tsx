import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as Blockly from 'blockly';
import type Phaser from 'phaser';
import { toolbox } from './blocks';
import {
  Camera, Engine, newProject, normalizeProject, object, Obj, Project, Scene, SoundAsset, TileMap, uid,
} from './runtime';
import { exportHtml } from './exportHtml';
import './style.css';

const DB = 'my-game-engine-v1';
const SOUND_LIMIT = 5 * 1024 * 1024;
const SOUND_TOTAL_LIMIT = 20 * 1024 * 1024;

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function save(project: Project) {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('projects', 'readwrite');
    transaction.objectStore('projects').put(project, 'current');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function load(): Promise<Project | null> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('projects');
    const request = transaction.objectStore('projects').get('current');
    request.onsuccess = () => {
      try { resolve(request.result ? normalizeProject(request.result) : null); }
      catch (error) { reject(error); }
      database.close();
    };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Stage({ state, onSelect, onMove, onClick, onError }: {
  state: any;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onClick: (obj: Obj) => void;
  onError: (message: string) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const latest = useRef({ state, onSelect, onMove, onClick, onError });
  latest.current = { state, onSelect, onMove, onClick, onError };

  useEffect(() => {
    if (!element.current) return;
    let dragging: string | null = null;
    let game: Phaser.Game | undefined;
    let disposed = false;
    void import('phaser').then(({ default: PhaserLib }) => {
      if (disposed || !element.current) return;
      game = new PhaserLib.Game({
        type: PhaserLib.CANVAS,
        width: 480,
        height: 360,
        backgroundColor: '#eef5ff',
        parent: element.current,
        scale: { mode: PhaserLib.Scale.FIT, autoCenter: PhaserLib.Scale.CENTER_BOTH },
        scene: {
          create() {
            const scene = this as Phaser.Scene;
            const graphics = scene.add.graphics();
            const sprites: Record<string, Phaser.GameObjects.Image> = {};
            const pending = new Set<string>();
            scene.events.on('update', (_time: number, delta: number) => {
              const view = latest.current.state;
              if (view.running && view.engine) view.engine.update(delta / 1000);
              const camera: Camera = view.camera || { x: 0, y: 0, zoom: 1 };
              const zoom = Math.min(3, Math.max(0.25, Number(camera.zoom) || 1));
              graphics.clear();
              const bg = PhaserLib.Display.Color.HexStringToColor(/^#[0-9a-f]{6}$/i.test(view.background) ? view.background : '#eef5ff');
              graphics.fillStyle(bg.color);
              graphics.fillRect(0, 0, 480, 360);

              const map: TileMap | undefined = view.tilemap;
              if (map) {
                const tileSize = map.tileSize * zoom;
                for (let row = 0; row < map.rows; row++) {
                  for (let column = 0; column < map.columns; column++) {
                    const tile = map.tiles[row]?.[column];
                    if (tile == null) continue;
                    const worldX = (column + 0.5 - map.columns / 2) * map.tileSize;
                    const worldY = (map.rows / 2 - row - 0.5) * map.tileSize;
                    const x = 240 + (worldX - camera.x) * zoom;
                    const y = 180 - (worldY - camera.y) * zoom;
                    graphics.fillStyle(PhaserLib.Display.Color.HexStringToColor(map.palette[tile] || '#3978c6').color);
                    graphics.fillRect(x - tileSize / 2, y - tileSize / 2, tileSize, tileSize);
                    graphics.lineStyle(1, 0xffffff, 0.18);
                    graphics.strokeRect(x - tileSize / 2, y - tileSize / 2, tileSize, tileSize);
                  }
                }
              }

              