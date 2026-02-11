import { useState, useEffect } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { Button, Modal, TextControl, SelectControl, TextareaControl, Spinner } from '@wordpress/components';

import AccountingPDFButton from './pdf/AccountingPDF.js';

const InventoryList = () => {
    // ... (existing code helpers)

    // Helper: Parse Snapshot Data safely
    const parseSnapshotData = (jsonString) => {
        try {
            return JSON.parse(jsonString);
        } catch (e) {
            console.error('Snapshot Parse Error', e);
            return [];
        }
    };

    const [items, setItems] = useState([]);
    const [snapshots, setSnapshots] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState('active'); // active | history

    // Form State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editItem, setEditItem] = useState(null);

    // Form Fields
    const [name, setName] = useState('');
    const [sourceType, setSourceType] = useState('BRED');
    const [quantity, setQuantity] = useState('');
    const [costPrice, setCostPrice] = useState('0');
    const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState('');

    useEffect(() => {
        fetchData();
        fetchSnapshots();
    }, []);

    useEffect(() => {
        if (sourceType === 'BRED') {
            setCostPrice('0');
        }
    }, [sourceType]);

    const fetchData = () => {
        setIsLoading(true);
        apiFetch({ path: '/breeder/v1/inventory' }).then(res => {
            setItems(res.items || []);
            setIsLoading(false);
        });
    };

    const fetchSnapshots = () => {
        apiFetch({ path: '/breeder/v1/inventory/snapshot' })
            .then(res => {
                if (Array.isArray(res)) {
                    setSnapshots(res);
                } else {
                    console.warn('Snapshots API returned non-array:', res);
                    setSnapshots([]);
                }
            })
            .catch(err => {
                console.error('Snapshot Fetch Error:', err);
                setSnapshots([]);
            });
    };

    const handleOpenModal = (item = null) => {
        setEditItem(item);
        if (item) {
            setName(item.name);
            setSourceType(item.source_type);
            setQuantity(item.quantity);
            setCostPrice(item.cost_price);
            setPurchaseDate(item.purchase_date);
            setNotes(item.notes);
        } else {
            setName('');
            setSourceType('BRED');
            setQuantity('');
            setCostPrice('0');
            setPurchaseDate(new Date().toISOString().split('T')[0]);
            setNotes('');
        }
        setIsModalOpen(true);
    };

    const handleSubmit = () => {
        const path = editItem ? `/breeder/v1/inventory/${editItem.id}` : '/breeder/v1/inventory';
        const method = editItem ? 'PUT' : 'POST';

        apiFetch({
            path,
            method,
            data: {
                name,
                source_type: sourceType,
                quantity,
                cost_price: sourceType === 'BRED' ? 0 : costPrice,
                purchase_date: purchaseDate,
                notes
            }
        }).then(() => {
            setIsModalOpen(false);
            fetchData();
        }).catch(err => {
            alert(err.message);
        });
    };

    const handleDelete = (id) => {
        if (!confirm('Delete this item?')) return;
        apiFetch({ path: `/breeder/v1/inventory/${id}`, method: 'DELETE' }).then(() => fetchData());
    };

    const handleSnapshot = () => {
        if (!confirm('現在の在庫に基づき、年末棚卸データを確定しますか？ (12月31日時点として保存されます)')) return;

        apiFetch({
            path: '/breeder/v1/inventory/snapshot',
            method: 'POST',
            data: { year: new Date().getFullYear() }
        }).then(res => {
            alert(`Snapshot created! Total Value: ¥${res.valuation}`);
            fetchSnapshots();
        });
    };

    // Calculate Total for Active
    const totalActiveValuation = items.reduce((acc, item) => acc + (item.quantity * item.cost_price), 0);

    return (
        <div className="inventory-manager">
            <div className="list-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <h2 style={{ margin: 0 }}>資産・在庫 (Inventory)</h2>
                    <div className="tab-switcher" style={{ display: 'flex', gap: '5px', marginLeft: '20px' }}>
                        <Button isSmall isPrimary={viewMode === 'active'} isSecondary={viewMode !== 'active'} onClick={() => setViewMode('active')}>現在在庫 (Active)</Button>
                        <Button isSmall isPrimary={viewMode === 'history'} isSecondary={viewMode !== 'history'} onClick={() => setViewMode('history')}>棚卸履歴 (Snapshots)</Button>
                    </div>
                </div>
                {viewMode === 'active' && <Button isPrimary onClick={() => handleOpenModal(null)}>+ 在庫を追加</Button>}
            </div>

            {viewMode === 'active' ? (
                <div style={{ padding: '20px' }}>
                    <div style={{ marginBottom: '20px', padding: '15px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <strong>期末棚卸評価額 (Total Valuation): </strong>
                            <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>¥{totalActiveValuation.toLocaleString()}</span>
                        </div>
                        <Button isSecondary onClick={handleSnapshot}>棚卸を実行 (Snapshot)</Button>
                    </div>

                    {isLoading ? <Spinner /> : (
                        <table className="wp-list-table widefat fixed striped">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Source</th>
                                    <th>Date</th>
                                    <th>Qty</th>
                                    <th>Unit Cost</th>
                                    <th>Total</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map(item => (
                                    <tr key={item.id}>
                                        <td>{item.name}</td>
                                        <td><span className={`badge ${item.source_type}`}>{item.source_type}</span></td>
                                        <td>{item.purchase_date}</td>
                                        <td>{item.quantity}</td>
                                        <td>¥{Number(item.cost_price).toLocaleString()}</td>
                                        <td><strong>¥{(item.quantity * item.cost_price).toLocaleString()}</strong></td>
                                        <td>{item.status}</td>
                                        <td>
                                            <Button isSmall isSecondary onClick={() => handleOpenModal(item)}>Edit</Button>
                                            <Button isSmall isDestructive style={{ marginLeft: '5px' }} onClick={() => handleDelete(item.id)}>Del</Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            ) : (
                <div style={{ padding: '20px' }}>
                    <h3>Year-End Snapshots (棚卸表履歴)</h3>
                    {snapshots.length === 0 && <p>No snapshots found.</p>}
                    <table className="wp-list-table widefat fixed striped">
                        <thead>
                            <tr>
                                <th>Fiscal Year</th>
                                <th>Snapshot Date</th>
                                <th>Total Valuation</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(Array.isArray(snapshots) ? snapshots : []).map(snap => {
                                let pdfData = [];
                                try {
                                    const parsed = typeof snap.data_json === 'string' ? JSON.parse(snap.data_json) : snap.data_json;
                                    pdfData = Array.isArray(parsed) ? parsed : [];
                                } catch (e) {
                                    pdfData = [];
                                }
                                return (
                                    <tr key={snap.id}>
                                        <td>{snap.year}</td>
                                        <td>{snap.snapshot_date}</td>
                                        <td><strong>¥{Number(snap.total_valuation).toLocaleString()}</strong></td>
                                        <td>
                                            <div style={{ display: 'inline-block' }}>
                                                <AccountingPDFButton
                                                    type="inventory"
                                                    data={pdfData}
                                                    config={{
                                                        snapshotDate: snap.snapshot_date,
                                                        totalValuation: snap.total_valuation
                                                    }}
                                                    buttonLabel="Print / PDF"
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {isModalOpen && (
                <Modal title={editItem ? "在庫の編集" : "新規在庫の登録"} onRequestClose={() => setIsModalOpen(false)}>
                    <div style={{ padding: '20px', maxWidth: '500px' }}>
                        <TextControl label="Asset Name (品名)" value={name} onChange={setName} />
                        <SelectControl
                            label="Source (区分)"
                            value={sourceType}
                            options={[
                                { label: 'Self-Bred (自家繁殖) - ¥0', value: 'BRED' },
                                { label: 'Purchased (仕入) - At Cost', value: 'PURCHASED' },
                                { label: 'Supplies (消耗品/貯蔵品) - At Cost', value: 'SUPPLY' },
                            ]}
                            onChange={setSourceType}
                        />
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <TextControl label="Quantity" type="number" value={quantity} onChange={setQuantity} />
                            <TextControl
                                label="Unit Cost (単価)"
                                type="number"
                                value={costPrice}
                                onChange={setCostPrice}
                                disabled={sourceType === 'BRED'}
                                help={sourceType === 'BRED' ? "Automatic 0 for Bred items." : "Enter purchase price."}
                            />
                        </div>
                        <TextControl label="Acquisition Date" type="date" value={purchaseDate} onChange={setPurchaseDate} />
                        <TextareaControl label="Notes" value={notes} onChange={setNotes} />

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', gap: '10px' }}>
                            <Button isSecondary onClick={() => setIsModalOpen(false)}>キャンセル</Button>
                            <Button isPrimary onClick={handleSubmit}>保存</Button>
                        </div>
                    </div>
                </Modal>
            )}

            <style>{`
                .badge { padding: 2px 6px; borderRadius: 4px; fontSize: 0.8rem; fontWeight: bold; }
                .badge.BRED { background: #dbeafe; color: #1e40af; }
                .badge.PURCHASED { background: #fce7f3; color: #9d174d; }
                .badge.SUPPLY { background: #f3f4f6; color: #374151; }
            `}</style>
        </div>
    );
};

export default InventoryList;
