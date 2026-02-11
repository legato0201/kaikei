import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { Spinner, Card, CardBody, CardHeader } from '@wordpress/components';

const Dashboard = ({ refreshTrigger }) => {
    const [stats, setStats] = useState({
        totalGross: 0,
        totalExpense: 0,
        netIncome: 0,
        count: 0
    });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        apiFetch({ path: '/breeder/v1/transactions' })
            .then((data) => {
                calculateStats(data);
                setIsLoading(false);
            })
            .catch((error) => {
                console.error(error);
                setIsLoading(false);
            });
    }, [refreshTrigger]);

    const calculateStats = (transactions) => {
        let gross = 0;
        let expense = 0;

        transactions.forEach(tx => {
            const amount = parseInt(tx.amount_net || tx.amount_gross, 10); // Use net for income ideally?
            // Actually, usually "Revenue" is formulated as Gross or Net depending on accounting style.
            // Let's stick to: Income = Net (after fee), Expense = Net (cost).

            if (tx.type === 'income') {
                gross += parseInt(tx.amount_net, 10);
            } else if (tx.type === 'expense') {
                expense += parseInt(tx.amount_net, 10);
                // Note: amount_net in expense is usually same as gross unless there's a fee (e.g. transfer fee deduct), 
                // but in our logic fee was mostly for sales platforms. 
                // Husband allocation logic reduced amount_gross, so amount_net follows suit.
            }
        });

        setStats({
            totalGross: gross,
            totalExpense: expense,
            netIncome: gross - expense,
            count: transactions.length
        });
    };

    if (isLoading) {
        return <Spinner />;
    }

    const cardStyle = { flex: 1, margin: '10px', textAlign: 'center' };

    return (
        <div className="breeder-dashboard" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap' }}>
            <Card style={cardStyle}>
                <CardHeader>Total Income (Net)</CardHeader>
                <CardBody>
                    <h3 style={{ color: '#2ecc71', fontSize: '2em', margin: 0 }}>
                        ¥{stats.totalGross.toLocaleString()}
                    </h3>
                </CardBody>
            </Card>

            <Card style={cardStyle}>
                <CardHeader>Total Expenses</CardHeader>
                <CardBody>
                    <h3 style={{ color: '#e74c3c', fontSize: '2em', margin: 0 }}>
                        ¥{stats.totalExpense.toLocaleString()}
                    </h3>
                </CardBody>
            </Card>

            <Card style={cardStyle}>
                <CardHeader>Net Profit</CardHeader>
                <CardBody>
                    <h3 style={{ color: stats.netIncome >= 0 ? '#3498db' : '#c0392b', fontSize: '2em', margin: 0 }}>
                        ¥{stats.netIncome.toLocaleString()}
                    </h3>
                </CardBody>
            </Card>
        </div>
    );
};

export default Dashboard;
