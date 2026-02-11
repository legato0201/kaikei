
import { useState, useEffect } from '@wordpress/element';
import { Modal, Button, Spinner } from '@wordpress/components';
import apiFetch from '@wordpress/api-fetch';

const AuditLogViewer = ({ transactionId, onClose }) => {
    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!transactionId) return;

        apiFetch({ path: `/breeder/v1/transactions/${transactionId}/audit` })
            .then((data) => {
                setLogs(data);
                setIsLoading(false);
            })
            .catch((err) => {
                console.error(err);
                setIsLoading(false);
            });
    }, [transactionId]);

    const formatJSON = (jsonString) => {
        try {
            const obj = JSON.parse(jsonString);
            return (
                <pre style={{ background: '#f1f5f9', padding: '10px', fontSize: '0.8rem', overflowX: 'auto', margin: 0 }}>
                    {JSON.stringify(obj, null, 2)}
                </pre>
            );
        } catch (e) {
            return jsonString;
        }
    };

    const renderDiff = (oldData, newData) => {
        if (!oldData || !newData) return null;
        try {
            const oldObj = JSON.parse(oldData);
            const newObj = JSON.parse(newData);
            const keys = Object.keys({ ...oldObj, ...newObj });
            const changes = [];

            keys.forEach(key => {
                // Ignore internal fields or timestamps if desired
                if (oldObj[key] != newObj[key]) {
                    changes.push(
                        <tr key={key}>
                            <td style={{ fontWeight: 'bold' }}>{key}</td>
                            <td style={{ color: '#ef4444', background: '#fef2f2' }}>{String(oldObj[key])}</td>
                            <td style={{ color: '#22c55e', background: '#f0fdf4' }}>{String(newObj[key])}</td>
                        </tr>
                    );
                }
            });

            if (changes.length === 0) return <div style={{ fontStyle: 'italic', color: '#64748b' }}>No substantial changes recorded.</div>;

            return (
                <table className="audit-diff-table" style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse', marginBottom: '10px' }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left', width: '20%' }}>Field</th>
                            <th style={{ textAlign: 'left', width: '40%' }}>Before</th>
                            <th style={{ textAlign: 'left', width: '40%' }}>After</th>
                        </tr>
                    </thead>
                    <tbody>{changes}</tbody>
                </table>
            );
        } catch (e) {
            return <div>Error parsing diff.</div>;
        }
    };

    return (
        <Modal title="訂正・削除履歴 (Correction History)" onRequestClose={onClose}>
            <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                <style>{`
                    .audit-log-entry { border: 1px solid #e2e8f0; padding: 15px; margin-bottom: 15px; border-radius: 6px; }
                    .audit-header { display: flex; justify-content: space-between; margin-bottom: 10px; font-weight: bold; color: '#334155'; }
                    .audit-meta { font-size: 0.8rem; color: #64748b; }
                    .audit-diff-table td, .audit-diff-table th { padding: 4px 8px; border: 1px solid #e2e8f0; }
                `}</style>

                {isLoading ? (
                    <Spinner />
                ) : logs.length === 0 ? (
                    <p>No history found for this transaction.</p>
                ) : (
                    logs.map((log) => (
                        <div key={log.id} className="audit-log-entry">
                            <div className="audit-header">
                                <span>Action: {log.action.toUpperCase()}</span>
                                <span className="audit-meta">{log.changed_at} (User ID: {log.changed_by})</span>
                            </div>

                            {log.action === 'update' ? (
                                <div>
                                    <div style={{ marginBottom: '5px', fontSize: '0.9rem', fontWeight: 600 }}>Changes:</div>
                                    {renderDiff(log.old_data, log.new_data)}
                                </div>
                            ) : log.action === 'delete' ? (
                                <div>
                                    <div style={{ color: '#ef4444', fontWeight: 'bold' }}>DELETED RECORD</div>
                                    <details>
                                        <summary>View Deleted Data</summary>
                                        {formatJSON(log.old_data)}
                                    </details>
                                </div>
                            ) : (
                                <div>
                                    <details>
                                        <summary>View Data</summary>
                                        {formatJSON(log.new_data)}
                                    </details>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
            <div style={{ marginTop: '20px', textAlign: 'right' }}>
                <Button onClick={onClose} isSecondary>閉じる</Button>
            </div>
        </Modal>
    );
};

export default AuditLogViewer;
