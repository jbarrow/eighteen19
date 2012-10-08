$(document).ready(function() {
	quotes = [
		"I am not a friend to a very energetic government. It is always oppressive.",
		"In matters of style, swim with the current. In matters of principle, stand like a rock.",
		"When wrongs are pressed because it is believed they will be borne, resistance becomes morality.",
		"The price of freedom is eternal vigilance.",
		"To compel a man to furnish funds for the propagation of ideas he disbelieves and abhors is sinful and tyrannical.",
		"Timid men prefer the calm of despotism to the tempestuous sea of liberty.",
		"The natural progress of things is for liberty to yield and government to gain ground."
	];

	$("#quote").html(quotes[Math.floor(Math.random() * quotes.length)]);
	if (window.location.pathname == "/request") {
		$("#login").slideUp();
		$("#request").slideDown();
	}
	$("#request-button").click(function() {
		$("#login").slideUp();
		$("#request").slideDown();
	});

	$("#signin-button").click(function() {
		$("#request").slideUp();
		$("#login").slideDown();
	});

	$('.captcha_drop')[0].setAttribute('src', $('#recaptcha_image').children()[0].getAttribute('src'));
});