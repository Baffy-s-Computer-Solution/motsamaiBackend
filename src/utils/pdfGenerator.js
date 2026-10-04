const PDFDocument = require('pdfkit');

function invoicePdfBuffer({ tripId, riderName, driverName, items = [], totalCents = 0, currency = 'USD' } = {}) {
	return new Promise((resolve, reject) => {
		try {
			const doc = new PDFDocument({ size: 'A4', margin: 40 });
			const buffers = [];
			doc.on('data', (chunk) => buffers.push(chunk));
			doc.on('end', () => resolve(Buffer.concat(buffers)));

			doc.fontSize(18).text('Trip Invoice', { align: 'center' });
			doc.moveDown();
			doc.fontSize(12).text(`Trip ID: ${tripId}`);
			doc.text(`Rider: ${riderName}`);
			doc.text(`Driver: ${driverName}`);
			doc.moveDown();

			items.forEach((it) => {
				doc.text(`${it.label} - ${(it.amount_cents / 100).toFixed(2)} ${currency}`);
			});

			doc.moveDown();
			doc.fontSize(14).text(`Total: ${(totalCents / 100).toFixed(2)} ${currency}`);
			doc.end();
		} catch (err) {
			reject(err);
		}
	});
}

module.exports = { invoicePdfBuffer };

