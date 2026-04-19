const express = require('express');
const { getSupabase } = require('../db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('compras').select('*').eq('activo', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { items, proveedor_id, proveedor_nombre, fecha, notas } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ error: 'Agrega al menos un producto' });
    }

    const total = items.reduce((a, i) => a + i.costo * i.qty, 0);
    const num = 'COMP-' + String(Date.now()).slice(-6);

    // Save compra
    const { data: compra, error } = await supabase.from('compras').insert([{
      numero: num, proveedor_id: proveedor_id || null,
      proveedor_nombre: proveedor_nombre || 'Sin proveedor',
      fecha: fecha || new Date().toISOString().slice(0, 10),
      items, total, notas, created_by: req.user.nombre, activo: true
    }]).select().single();

    if (error) throw error;

    // Update stock with weighted average cost
    for (const item of items) {
      if (!item.pid) continue;
      const { data: prod } = await supabase.from('productos').select('stock, costo').eq('id', item.pid).single();
      if (!prod) continue;

      const stockActual = prod.stock || 0;
      const costoActual = prod.costo || 0;
      const costoProm = stockActual > 0
        ? ((costoActual * stockActual) + (item.costo * item.qty)) / (stockActual + item.qty)
        : item.costo;

      await supabase.from('productos').update({
        stock: stockActual + item.qty,
        costo: Math.round(costoProm * 100) / 100
      }).eq('id', item.pid);

      // Register movement
      await supabase.from('movimientos_inventario').insert([{
        producto_id: item.pid, producto_nombre: item.nombre,
        tipo: 'entrada', cantidad: item.qty,
        referencia_tipo: 'compra', referencia_id: compra.id,
        referencia_numero: num, usuario: req.user.nombre,
        notas: 'Compra ' + num
      }]);
    }

    await supabase.from('logs').insert([{
      usuario: req.user.nombre, accion: 'crear_compra',
      tabla: 'compras', referencia_id: compra.id,
      detalle: 'Compra ' + num + ' - Total: RD$' + total.toFixed(2)
    }]);

    res.json(compra);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    await supabase.from('compras').update({ activo: false }).eq('id', req.params.id);
    await supabase.from('logs').insert([{
      usuario: req.user.nombre, accion: 'cancelar_compra',
      tabla: 'compras', referencia_id: +req.params.id, detalle: 'Compra cancelada'
    }]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
