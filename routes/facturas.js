const express = require('express');
const { getSupabase } = require('../db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', verifyToken, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('facturas').select('*').eq('activo', true)
      .order('id', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', verifyToken, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { cliente_id, cliente, telefono, fecha, items, pago, tipo } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ error: 'Agrega al menos un producto' });
    }

    // Validate stock
    for (const item of items) {
      if (!item.pid) continue;
      const { data: prod } = await supabase.from('productos').select('stock, nombre').eq('id', item.pid).single();
      if (prod && prod.stock < item.qty) {
        return res.status(400).json({ error: 'Stock insuficiente para: ' + prod.nombre });
      }
    }

    const total = items.reduce((a, i) => a + i.precio * i.qty, 0);
    const ganancia = items.reduce((a, i) => a + (i.precio - (i.costo || 0)) * i.qty, 0);

    // Auto numbering
    let num;
    try {
      const { data: seqData } = await supabase.rpc('nextval', { seq_name: 'factura_seq' });
      num = 'FAC-' + String(seqData).padStart(6, '0');
    } catch {
      num = 'FAC-' + String(Date.now()).slice(-6);
    }

    const { data: factura, error } = await supabase.from('facturas').insert([{
      numero: num, cliente_id: cliente_id || null,
      cliente: cliente || 'Cliente General',
      telefono: telefono || '',
      fecha: fecha || new Date().toISOString().slice(0, 10),
      items, total, ganancia, pago: pago || 'Contado Efectivo',
      tipo: tipo || 'Manual',
      vendedor: req.user.nombre,
      created_by: req.user.nombre,
      activo: true
    }]).select().single();

    if (error) throw error;

    // Discount stock and register movements
    for (const item of items) {
      if (!item.pid) continue;
      const { data: prod } = await supabase.from('productos').select('stock').eq('id', item.pid).single();
      if (!prod) continue;
      await supabase.from('productos').update({ stock: Math.max(0, prod.stock - item.qty) }).eq('id', item.pid);
      await supabase.from('movimientos_inventario').insert([{
        producto_id: item.pid, producto_nombre: item.nombre,
        tipo: 'salida', cantidad: item.qty,
        referencia_tipo: 'factura', referencia_id: factura.id,
        referencia_numero: num, usuario: req.user.nombre,
        notas: 'Factura ' + num
      }]);
    }

    await supabase.from('logs').insert([{
      usuario: req.user.nombre, accion: 'crear_factura',
      tabla: 'facturas', referencia_id: factura.id,
      detalle: 'Factura ' + num + ' - ' + (cliente || 'Cliente General') + ' - RD$' + total.toFixed(2)
    }]);

    res.json(factura);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('facturas').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    await supabase.from('logs').insert([{
      usuario: req.user.nombre, accion: 'editar_factura',
      tabla: 'facturas', referencia_id: +req.params.id, detalle: 'Factura editada'
    }]);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();

    // Get factura to restore stock
    const { data: factura } = await supabase.from('facturas').select('*').eq('id', req.params.id).single();
    if (factura) {
      for (const item of (factura.items || [])) {
        if (!item.pid) continue;
        const { data: prod } = await supabase.from('productos').select('stock').eq('id', item.pid).single();
        if (prod) {
          await supabase.from('productos').update({ stock: prod.stock + item.qty }).eq('id', item.pid);
        }
      }
    }

    await supabase.from('facturas').update({ activo: false }).eq('id', req.params.id);
    await supabase.from('logs').insert([{
      usuario: req.user.nombre, accion: 'cancelar_factura',
      tabla: 'facturas', referencia_id: +req.params.id,
      detalle: 'Factura ' + (factura?.numero || '') + ' cancelada'
    }]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
