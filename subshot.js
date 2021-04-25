require('colors');
const fs = require('fs');
const axios = require('axios');
const puppeteer = require('puppeteer');
const execute = require('child_process').exec;

function getSubdomains(domain) {
	return new Promise((resolve, reject) => {
		const cmd = `python Sublist3r/sublist3r.py -d ${domain} -n`;
		execute(cmd, (err, out) => {
			const subdomains = out.split('\n');
			const found = [];

			subdomains.forEach(subdomain => {
				if(subdomain.match('^[a-z0-9].*'))
					found.push(subdomain);
			});

			if(subdomains.length == 0) reject();
			else resolve(found);
		})
	});
}

function screenshot(browser, subdomain, domain) {
	return new Promise(async (resolve, reject) => {
		let failed = false;
		await axios.get(`http://${subdomain}`, { timeout: 7500 })
			.catch(async err => {
				const valid = [202, 503, 500, 404, 302, 301];

				if(err.response) {
					if(!valid.includes(err.response.status)) {
						failed = true;
						reject();
					}
				}
			});

		if(failed) return;

		const page = await browser.newPage();
		await page.setDefaultNavigationTimeout(7500);
		await page.goto(`http://${subdomain}`)
			.catch(async () => {
				await page.close();
				failed = true;
				reject();
			});

		if(failed) return;

		await page.setViewport({
			width: 1024,
			height: 800
		});
		await page.screenshot({
			path: `./results/${domain}/imgs/${subdomain}.jpg`,
			type: "jpeg",
			fullPage: true
		});
		await page.close();

		resolve();
	});
}

function createLog(domain, subdomains) {
	return new Promise((resolve, reject) =>  {
		fs.mkdir(`results/${domain}/imgs`, { recursive: true }, err => {
			if(err) reject();

			const content = subdomains.join("\n");

			fs.writeFile(`results/${domain}/subdomains.txt`, content, (err) => {
				if(err) reject();

				resolve();
			})
		})
	})
}

async function start(domain) {
	const subdomains = await getSubdomains(domain)
		.catch(() => {
			console.log("No subdomains found!");
			process.exit();
		});

	console.log(`Found ${subdomains.length} subdomains, writing to log.`);
	await createLog(domain, subdomains)
		.catch(() => {
			console.log("Error writing files!");
			process.exit();
		});

	const browser = await puppeteer.launch({args: [
		'--headless',
		'--log-level=3',
		'--allow-insecure-localhost',
		'--disable-dev-shm-usage',
		'--no-sandbox',
		'--disable-extensions',
		'--disable-gpu',
		'--ignore-certificate-errors'
	]});

	for(let subdomain of subdomains) {
		await screenshot(browser, subdomain, domain)
			.then(() => console.log(`[!] Captured ${subdomain}`.green.bold))
			.catch(() => console.log(`[!] Failed to screenshot ${subdomain}`.red.bold));
	}

	await browser.close();
	process.exit(1);
}

!function main(args) {
	if(args.length <= 1) {
		console.log("Domain not found.");
		console.log("Expected: node subshot.js [domain-here]");
		process.exit(1);
	}

	console.log("Starting scan on " + args[2]);
	start(args[2]);
}(process.argv)