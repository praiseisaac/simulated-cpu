```typescript
  addPeripheral({
      peripheralType: form.peripheralType,
      id: nextId(form.peripheralType),
      name: form.name || PRESETS[form.peripheralType].name || form.peripheralType,
      handlerAddress: form.peripheralType === "screen" ? 0 : handlerAddress,
      priority: parseInt(form.priority) || 0,
      ...(form.peripheralType === "timer" && {
        interval: parseInt(form.interval) || 10,
      }),
      ...(form.peripheralType === "sensor" && {
        threshold: parseInt(form.threshold) || 75,
      }),
      ...(form.peripheralType === "proximity" && {
        radius: parseInt(form.radius) || 100,
      }),
      ...(form.peripheralType === "screen" && {
        gridWidth: parseInt(form.gridWidth) || 32,
        gridHeight: parseInt(form.gridHeight) || 8,
        sourceAddress: parseInt(form.sourceAddress, 16) || 0x0038,
      }),
    });
```

This won't scale as it has to decide and have conditions for different/new peripherals